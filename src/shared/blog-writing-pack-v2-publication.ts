import type { BlogWritingPackV2ReadinessEvaluation } from './blog-writing-pack-v2-readiness';
import type { BlogWritingPackV2ResolvedEvidence } from './blog-writing-pack-v2-selection';

export const BLOG_V2_PUBLICATION_RULE_VERSION = 'blog-v2-publication-1' as const;
export interface BlogV2FileReference { relative_path: string; sha256: string; byte_size: number; }
export interface BlogV2Representations {
  normalized: { implementation: string; rows: Array<Record<string, unknown>> };
  derived: {
    rows: Array<{ row_index: number; values: Record<string, unknown> }>;
    transformations: Array<{ field: string; expression: string; unit?: string; approved_for_blog: boolean }>;
  };
}
export interface BlogWritingPackV2Payload {
  schema_version: '2.0'; recipe_id: 'BLOG_WRITING_PACK'; recipe_version: 2;
  package_id: string; workspace_id: string; draft_id: string;
  members: Array<BlogV2Representations & {
    evidence: BlogWritingPackV2ResolvedEvidence;
    raw: BlogV2FileReference;
    acquisition_metadata?: BlogV2FileReference;
  }>;
}
export interface BlogWritingPackV2PublicationManifest {
  schema_version: '2.0'; recipe_id: 'BLOG_WRITING_PACK'; recipe_version: 2;
  package_id: string; workspace_id: string; draft_id: string; created_at: string; application_version: string;
  selected_evidence: BlogWritingPackV2ResolvedEvidence[];
  files: BlogV2FileReference[];
  publication_status: 'JSON_ONLY_PUBLISHED'; delivery_status: 'INCOMPLETE';
  readiness: {
    rule_version: typeof BLOG_V2_PUBLICATION_RULE_VERSION;
    evaluated_at: string; verdict: 'SATISFIED'; evaluation: BlogWritingPackV2ReadinessEvaluation;
  };
}
export interface PublishedBlogWritingPackV2 {
  payload: BlogWritingPackV2Payload;
  manifest: BlogWritingPackV2PublicationManifest;
}
