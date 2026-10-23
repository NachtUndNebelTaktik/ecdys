import { contextBridge, ipcRenderer } from 'electron';
import type { RequestType } from '../../shared/src/model';
contextBridge.exposeInMainWorld('styg',Object.freeze({invoke:(request:RequestType)=>ipcRenderer.invoke('styg:request',request)}));
