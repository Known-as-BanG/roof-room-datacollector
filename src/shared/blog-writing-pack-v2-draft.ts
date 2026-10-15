import type { BlogWritingPackV2ResolvedEvidence } from './blog-writing-pack-v2-selection';

// Membership only; dataset compliance and delivery readiness have not been evaluated.
export interface BlogWritingPackV2Draft {
  draft_version: 1;
  recipe_id: 'BLOG_WRITING_PACK';
  recipe_version: 2;
  package_id: string;
  workspace_id: string;
  created_at: string;
  application_version: string;
  state: 'DRAFT';
  readiness_status: 'NOT_EVALUATED';
  selected_evidence: BlogWritingPackV2ResolvedEvidence[];
}
