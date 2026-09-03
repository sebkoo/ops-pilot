import { z } from 'zod';

export const IssueCategory = z.enum([
  'equipment',
  'safety',
  'cleanliness',
  'other',
]);
export const IssuePriority = z.enum(['low', 'medium', 'high', 'critical']);
export const IssueStatus = z.enum([
  'open',
  'assigned',
  'in_progress',
  'resolved',
]);

export const ALLOWED_TRANSITIONS: Record<
  z.infer<typeof IssueStatus>,
  z.infer<typeof IssueStatus> | null
> = {
  open: 'assigned',
  assigned: 'in_progress',
  in_progress: 'resolved',
  resolved: null,
};

export const CreateISsueSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1).max(120),
  details: z.string().max(4000).default(''),
  category: IssueCategory,
  priority: IssuePriority,
  location: z.string().trim().min(1).max(200),
});

export const UpdateIssueSchema = z.object({
  version: z.number().int().positive(),
  title: z.string().trim().min(1).max(120).optional(),
  details: z.string().max(4000).optional(),
  category: IssueCategory.optional(),
  priority: IssuePriority.optional(),
  status: IssueStatus.optional(),
  location: z.string().trim().min(1).max(200).optional(),
  assignee: z.string().trim().max(80).nullish().optional(),
});

export const ListIssuesQuerySchema = z.object({
  status: IssueStatus.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type CreateIssueInput = z.infer<typeof CreateISsueSchema>;
export type UpdateIssueInput = z.infer<typeof UpdateIssueSchema>;

export interface Issue {
  id: string;
  title: string;
  details: string;
  category: z.infer<typeof IssueCategory>;
  priority: z.infer<typeof IssuePriority>;
  status: z.infer<typeof IssueStatus>;
  location: string;
  assignee: string | null;
  aiSummary: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
