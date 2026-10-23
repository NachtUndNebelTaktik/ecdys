#!/usr/bin/env python3
"""Private lab endpoints and uncached, nonce-correlated traffic probes. No dependencies."""
import argparse
import ipaddress
import json
import secrets
import socket
import socketserver
import struct
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def read_exact(sock, count):
    result = bytearray()
    while len(result) < count:
        data = sock.recv(count - len(result))
        if not data:
            raise ValueError('truncated TCP frame')
        result.extend(data)
    return bytes(result)


def question_end(packet):
    if len(packet) < 17:
        raise ValueError('short DNS message')
    offset = 12
    while True:
        if offset >= len(packet):
            raise ValueError('truncated DNS name')
        size = packet[offset]
        offset += 1
        if size == 0:
            break
        if size > 63 or offset + size > len(packet):
            raise ValueError('invalid DNS label')
        offset += size
    if offset + 4 > len(packet):
        raise ValueError('missing DNS question')
    return offset + 4


def dns_reply(packet, source):
    end = question_end(packet)
    ident, flags, questions, answers, authority, additional = struct.unpack('!6H', packet[:12])
    if flags != 0x100 or (questions, answers, authority, additional) != (1, 0, 0, 0) or end != len(packet) or packet[end-4:end] != b'\x00\x10\x00\x01':
        raise ValueError('unsupported DNS query')
    label_size = packet[12]
    nonce = packet[13:13+label_size].decode('ascii')
    value = f'{nonce}|{source}'.encode('ascii')
    txt = bytes([len(value)]) + value
    return struct.pack('!6H', ident, 0x8180, 1, 1, 0, 0) + packet[12:end] + b'\xc0\x0c' + struct.pack('!HHIH', 16, 1, 0, len(txt)) + txt


def decode_dns(reply, query, nonce):
    end = question_end(query)
    if len(reply) < end + 13 or reply[:2] != query[:2] or struct.unpack('!5H', reply[2:12]) != (0x8180, 1, 1, 0, 0) or reply[12:end] != query[12:end]:
        raise ValueError('DNS transaction/question mismatch')
    pointer, kind, cls, ttl, size = struct.unpack('!HHHIH', reply[end:end+12])
    if (pointer, kind, cls) != (0xc00c, 16, 1) or len(reply) != end + 12 + size:
        raise ValueError('invalid DNS answer')
    data = reply[end+12:]
    if not data or data[0] != len(data)-1:
        raise ValueError('invalid TXT answer')
    text = data[1:].decode('ascii')
    expected = nonce + '|'
    if not text.startswith(expected):
        raise ValueError('DNS nonce mismatch')
    return str(ipaddress.ip_address(text[len(expected):]))


class HTTPHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        nonce = self.path.lstrip('/')
        data = json.dumps({'nonce': nonce, 'source': self.client_address[0]}).encode()
        self.send_response(200)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args):
        pass


class UDPHandler(socketserver.BaseRequestHandler):
    def handle(self):
        data, sock = self.request
        try:
            source = self.client_address[0]
            if self.server.is_dns:
                reply = dns_reply(data, source)
            else:
                nonce = json.loads(data)['nonce']
                if not isinstance(nonce, str) or len(nonce) > 64:
                    return
                reply = json.dumps({'nonce': nonce, 'source': source}).encode()
            sock.sendto(reply, self.client_address)
        except (ValueError, KeyError, UnicodeError, OSError):
            pass  # Invalid unsolicited packets have no response.


class DNSHandler(socketserver.BaseRequestHandler):
    def handle(self):
        self.request.settimeout(1)
        try:
            size = struct.unpack('!H', read_exact(self.request, 2))[0]
            if size > 4096:
                return
            reply = dns_reply(read_exact(self.request, size), self.client_address[0])
            self.request.sendall(struct.pack('!H', len(reply)) + reply)
        except (ValueError, UnicodeError, OSError):
            pass


class PrivateBind:
    allow_reuse_address = True
    daemon_threads = True

    def server_bind(self):
        if self.address_family == socket.AF_INET6:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        super().server_bind()


def serve(args):
    servers, endpoints = [], []
    try:
        for host in args.bind:
            version = ipaddress.ip_address(host).version
            family = socket.AF_INET if version == 4 else socket.AF_INET6
            def start(base, handler, port, is_dns=False):
                cls = type('LabServer', (PrivateBind, base), {'address_family': family})
                server = cls((host, port), handler)
                server.is_dns = is_dns
                servers.append(server)
                threading.Thread(target=server.serve_forever, daemon=True).start()
                return server.server_address[1]
            http_port = start(ThreadingHTTPServer, HTTPHandler, args.http_port)
            udp_port = start(socketserver.ThreadingUDPServer, UDPHandler, args.udp_port)
            dns_port = start(socketserver.ThreadingUDPServer, UDPHandler, args.dns_port, True)
            start(socketserver.ThreadingTCPServer, DNSHandler, dns_port)
            endpoints.append({'host': host, 'family': version, 'httpPort': http_port, 'udpPort': udp_port, 'dnsPort': dns_port})
        print(json.dumps({'endpoints': endpoints}), flush=True)
        threading.Event().wait()
    finally:
        for server in servers:
            server.server_close()


def probe(args):
    nonce = secrets.token_hex(12)
    ip = ipaddress.ip_address(args.host)
    family = socket.AF_INET if ip.version == 4 else socket.AF_INET6
    udp = args.protocol in ('udp', 'dns_udp')
    dns = args.protocol.startswith('dns_')
    with socket.socket(family, socket.SOCK_DGRAM if udp else socket.SOCK_STREAM) as sock:
        sock.settimeout(args.timeout)
        sock.connect((str(ip), args.port))
        try:
            return exchange(sock, args, nonce, udp, dns)
        except TimeoutError:
            # A completed TCP handshake already demonstrates an allowed route.
            if not udp:
                raise ValueError('response timed out after TCP connection succeeded')
            raise


def exchange(sock, args, nonce, udp, dns):
    query = None
    if dns:
        query = struct.pack('!6H', secrets.randbelow(65536), 0x100, 1, 0, 0, 0) + bytes([len(nonce)]) + nonce.encode() + b'\x04styg\x04test\x00\x00\x10\x00\x01'
        sock.sendall(query if udp else struct.pack('!H', len(query)) + query)
    elif udp:
        sock.sendall(json.dumps({'nonce': nonce}).encode())
    else:
        sock.sendall(f'GET /{nonce} HTTP/1.0\r\nHost: styg.test\r\n\r\n'.encode())
    if udp:
        reply = sock.recv(8192)
    elif dns:
        length = struct.unpack('!H', read_exact(sock, 2))[0]
        if length > 4096:
            raise ValueError('oversized DNS frame')
        reply = read_exact(sock, length)
    else:
        reply = bytearray()
        deadline = time.monotonic() + args.timeout
        while True:
            sock.settimeout(max(0.001, deadline - time.monotonic()))
            chunk = sock.recv(4096)
            if not chunk:
                break
            reply.extend(chunk)
            if len(reply) > 8192 or time.monotonic() > deadline:
                raise ValueError('oversized or slow HTTP reply')
        header, body = bytes(reply).split(b'\r\n\r\n', 1)
        if not header.split(b'\r\n', 1)[0].endswith(b' 200 OK'):
            raise ValueError('HTTP status was not 200')
        reply = body
    if dns:
        source = decode_dns(reply, query, nonce)
    else:
        value = json.loads(reply)
        if value.get('nonce') != nonce:
            raise ValueError('response nonce mismatch')
        source = str(ipaddress.ip_address(value['source']))
    return {'status': 'received', 'source': source}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    server = commands.add_parser('serve')
    server.add_argument('--bind', action='append', required=True)
    server.add_argument('--http-port', type=int, default=0)
    server.add_argument('--udp-port', type=int, default=0)
    server.add_argument('--dns-port', type=int, default=0)
    client = commands.add_parser('probe')
    client.add_argument('--host', required=True)
    client.add_argument('--port', type=int, required=True)
    client.add_argument('--protocol', choices=['http', 'udp', 'dns_udp', 'dns_tcp'], required=True)
    client.add_argument('--timeout', type=float, default=1)
    args = parser.parse_args()
    if args.command == 'serve':
        serve(args)
    else:
        try:
            result = probe(args)
        except TimeoutError:
            result = {'status': 'timeout'}
        except (OSError, ValueError, KeyError, TypeError, struct.error) as error:
            result = {'status': 'error', 'detail': f'{type(error).__name__}: {error}'[:500]}
        print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
