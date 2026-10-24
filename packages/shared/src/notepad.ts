import {z} from 'zod';

export const PRO_CLOUD_STORAGE_BYTES = 1_000_000_000;
export const NOTEPAD_LOCAL_STORAGE_BYTES = 5_000_000_000;
export const NOTEPAD_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const NOTEPAD_MAX_FILES = 200;
export const NotepadDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    body: z.string().max(180000),
  })
  .strict()
  .refine(
    (draft) => JSON.stringify(draft).length <= 196608,
    'This note has reached its size limit.',
  );
export const SaveNotepadSchema = z
  .object({revision: z.number().int().positive(), draft: NotepadDraftSchema})
  .strict();
export const NotepadFileMetadataSchema = z
  .object({
    id: z.uuid(),
    name: z
      .string()
      .min(1)
      .max(255)
      .refine((name) => !/[\x00-\x1f\x7f/\\]/.test(name) && name !== '.' && name !== '..'),
    bytes: z.number().int().min(0).max(NOTEPAD_MAX_FILE_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();
export type NotepadDraft = z.infer<typeof NotepadDraftSchema>;
export interface NotepadDocument extends NotepadDraft {
  revision: number;
  updatedAt: number;
}
export interface NotepadFile extends z.infer<typeof NotepadFileMetadataSchema> {
  available: boolean;
}
export interface NotepadState {
  note: NotepadDocument;
  files: NotepadFile[];
  usedBytes: number;
  localLimitBytes: number;
  cloud: {plan: 'Pro'; allowanceBytes: number; status: 'not_connected'};
}
