import {z} from 'zod';

export const researchKinds = [
  'topic',
  'person',
  'organization',
  'domain',
  'address',
  'note',
] as const;
export const toolCategories = [
  'Search',
  'Infrastructure',
  'Archives',
  'Blockchain',
  'Custom',
] as const;

export const ResearchUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .transform((value, ctx) => {
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
        throw new Error();
      return url.href;
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'Use an HTTP or HTTPS URL without embedded credentials.',
      });
      return z.NEVER;
    }
  });
export const MindNodeSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(100),
    kind: z.enum(researchKinds),
    note: z.string().max(4000),
    sourceUrl: z.union([z.literal(''), ResearchUrlSchema]),
    x: z.number().finite().min(-10000).max(10000),
    y: z.number().finite().min(-10000).max(10000),
  })
  .strict();
export const MindEdgeSchema = z
  .object({
    id: z.uuid(),
    source: z.uuid(),
    target: z.uuid(),
    label: z.string().trim().max(80),
  })
  .strict();
export const ResearchToolSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(80),
    category: z.enum(toolCategories),
    description: z.string().trim().max(300),
    url: ResearchUrlSchema,
    pinned: z.boolean(),
  })
  .strict();
export const ResearchDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    nodes: z.array(MindNodeSchema).max(100),
    edges: z.array(MindEdgeSchema).max(200),
    tools: z.array(ResearchToolSchema).max(60),
  })
  .strict()
  .superRefine((draft, ctx) => {
    const nodes = new Set(draft.nodes.map((node) => node.id));
    const connections = new Set<string>();
    if (
      nodes.size !== draft.nodes.length ||
      new Set(draft.edges.map((edge) => edge.id)).size !== draft.edges.length ||
      new Set(draft.tools.map((tool) => tool.id)).size !== draft.tools.length
    )
      ctx.addIssue({code: 'custom', message: 'Each research item must have a unique ID.'});
    for (const edge of draft.edges) {
      const pair = [edge.source, edge.target].sort().join(':');
      if (
        edge.source === edge.target ||
        !nodes.has(edge.source) ||
        !nodes.has(edge.target) ||
        connections.has(pair)
      )
        ctx.addIssue({code: 'custom', message: 'Connect two existing nodes once.'});
      connections.add(pair);
    }
    if (JSON.stringify(draft).length > 196608)
      ctx.addIssue({
        code: 'custom',
        message: 'This research workspace has reached its storage limit.',
      });
  });
export type MindNode = z.infer<typeof MindNodeSchema>;
export type MindEdge = z.infer<typeof MindEdgeSchema>;
export type ResearchTool = z.infer<typeof ResearchToolSchema>;
export type ResearchDraft = z.infer<typeof ResearchDraftSchema>;
export interface ResearchWorkspace extends ResearchDraft {
  revision: number;
  updatedAt: number;
}
export const SaveResearchSchema = z
  .object({
    revision: z.number().int().positive(),
    draft: ResearchDraftSchema,
  })
  .strict();
export function initialResearch(): ResearchDraft {
  return {
    title: 'Research workspace',
    nodes: [],
    edges: [],
    tools: [
      {
        id: 'b17d5071-a643-441b-89af-5cfbe5aca001',
        name: 'DuckDuckGo',
        category: 'Search',
        description: 'Search public web sources.',
        url: 'https://duckduckgo.com/',
        pinned: true,
      },
      {
        id: 'b17d5071-a643-441b-89af-5cfbe5aca002',
        name: 'crt.sh',
        category: 'Infrastructure',
        description: 'Explore public certificate transparency records.',
        url: 'https://crt.sh/',
        pinned: true,
      },
      {
        id: 'b17d5071-a643-441b-89af-5cfbe5aca003',
        name: 'RIPEstat',
        category: 'Infrastructure',
        description: 'Look up public IP, ASN and routing information.',
        url: 'https://stat.ripe.net/',
        pinned: false,
      },
      {
        id: 'b17d5071-a643-441b-89af-5cfbe5aca004',
        name: 'Wayback Machine',
        category: 'Archives',
        description: 'Browse archived versions of public web pages.',
        url: 'https://web.archive.org/',
        pinned: true,
      },
      {
        id: 'b17d5071-a643-441b-89af-5cfbe5aca005',
        name: 'Shodan',
        category: 'Infrastructure',
        description: 'Search indexed internet infrastructure. Some features require an account.',
        url: 'https://www.shodan.io/',
        pinned: false,
      },
      {
        id: 'b17d5071-a643-441b-89af-5cfbe5aca006',
        name: 'mempool.space',
        category: 'Blockchain',
        description: 'Inspect public Bitcoin transactions and blocks.',
        url: 'https://mempool.space/',
        pinned: false,
      },
    ],
  };
}
