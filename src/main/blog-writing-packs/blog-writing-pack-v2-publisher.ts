import { isDeepStrictEqual } from 'node:util';
import type { BlogWritingPackV2ReadinessEvaluation, BlogWritingPackV2Requirements } from '../../shared/blog-writing-pack-v2-readiness';
import { BLOG_V2_PUBLICATION_RULE_VERSION, type BlogWritingPackV2Payload, type PublishedBlogWritingPackV2 } from '../../shared/blog-writing-pack-v2-publication';
import { evaluateBlogWritingPackV2Readiness } from './blog-writing-pack-v2-readiness';
import { inspectBlogWritingPackV2Fields } from './blog-writing-pack-v2-field-compliance';
import { blocksBlogV2Publication, blogV2FileReference } from './blog-writing-pack-v2-publication-format';
import type { BlogWritingPackStore } from './blog-writing-pack-store';

class PublicationBlocked extends Error {
  constructor(readonly readiness: BlogWritingPackV2ReadinessEvaluation) { super('Blog v2 publication is blocked.'); }
}

export const publishBlogWritingPackV2 = async (
  input: { package_id: string; draft_id: string; workspace_id: string; application_version: string; requirements: BlogWritingPackV2Requirements },
  dependencies: Parameters<typeof evaluateBlogWritingPackV2Readiness>[1] & {
    store: Pick<BlogWritingPackStore, 'readDraft' | 'publishJsonV2'>;
    now?: () => Date;
  },
): Promise<{ status: 'PUBLISHED'; publication: PublishedBlogWritingPackV2 } | { status: 'BLOCKED'; readiness: BlogWritingPackV2ReadinessEvaluation }> => {
  const request = JSON.parse(JSON.stringify(input)) as typeof input;
  if (request.package_id === request.draft_id) throw new Error('Publication must not overwrite its frozen draft.');
  const draft = await dependencies.store.readDraft(request.draft_id);
  if (draft.workspace_id !== request.workspace_id) throw new Error('Publication draft is outside the selected Workspace.');
  try {
    const publication = await dependencies.store.publishJsonV2(request.package_id, async (writeEvidence) => {
      const acquired = [];
      for (const [index, evidence] of draft.selected_evidence.entries()) {
        const loaded = await dependencies.loader.readAcceptedJobArtifact(evidence.run_id, evidence.job_id);
        if (loaded.artifact.artifact_id !== evidence.artifact_id || loaded.artifact.sha256 !== evidence.artifact_sha256
          || loaded.artifact.byte_size !== evidence.artifact_byte_size || !isDeepStrictEqual(loaded.requested_context, evidence.requested_context)
          || !isDeepStrictEqual(loaded.serp_acquisition, evidence.serp_acquisition)
          || !isDeepStrictEqual(loaded.gsc_date_coverage, evidence.gsc_date_coverage)) throw new Error('Frozen publication evidence identity or integrity changed.');
        const directory = `evidence/${String(index).padStart(6, '0')}`;
        const raw = blogV2FileReference(`${directory}/raw.bin`, loaded.bytes);
        await writeEvidence(raw, loaded.bytes);
        let acquisition_metadata;
        const acquisition = evidence.serp_acquisition ?? evidence.gsc_date_coverage;
        if (acquisition) {
          if (!loaded.acquisition_metadata_bytes) throw new Error('Publication acquisition metadata bytes are unavailable.');
          acquisition_metadata = blogV2FileReference(`${directory}/acquisition-metadata.json`, loaded.acquisition_metadata_bytes);
          if (acquisition_metadata.sha256 !== acquisition.metadata_sha256 || acquisition_metadata.byte_size !== acquisition.metadata_byte_size) {
            throw new Error('Publication acquisition metadata integrity failed.');
          }
          await writeEvidence(acquisition_metadata, loaded.acquisition_metadata_bytes);
        }
        acquired.push({ evidence, loaded, raw, acquisition_metadata });
      }
      // This is the creation boundary, after the selected evidence has been staged.
      const created_at = (dependencies.now ?? (() => new Date()))().toISOString();
      const readiness = await evaluateBlogWritingPackV2Readiness({ package_id: request.draft_id, workspace_id: request.workspace_id,
        requirements: request.requirements, evaluated_at: created_at, evaluation_phase: 'PUBLICATION' }, dependencies);
      if (readiness.coverage_status !== 'COMPLETE' || readiness.blockers.some(blocksBlogV2Publication)) throw new PublicationBlocked(readiness);
      if (!isDeepStrictEqual(readiness.selected_evidence, draft.selected_evidence)) throw new Error('Frozen publication membership changed.');
      const members: BlogWritingPackV2Payload['members'] = acquired.map(({ evidence, loaded, raw, acquisition_metadata }) => {
        const inspected = inspectBlogWritingPackV2Fields(evidence.source_id,
          ['google-ads-search-terms', 'google-search-console-query-page'].includes(evidence.source_id)
            ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(loaded.bytes)) : loaded.bytes,
          loaded.requested_context, evidence.acquired_at, created_at,
          { acquisition: loaded.serp_acquisition, evaluated_at: created_at, reference_origin: 'PACKAGE_CREATED_AT' }, created_at, loaded.gsc_date_coverage_evidence);
        if (!inspected.publication || inspected.publication.derived.transformations.some((item) => !item.approved_for_blog)) {
          throw new Error('Source publication representations contain unsupported or unapproved transformations.');
        }
        return { evidence, raw, ...(acquisition_metadata ? { acquisition_metadata } : {}), ...inspected.publication };
      });
      const identity = { schema_version: '2.0' as const, recipe_id: 'BLOG_WRITING_PACK' as const, recipe_version: 2 as const,
        package_id: request.package_id, workspace_id: request.workspace_id, draft_id: request.draft_id };
      return { payload: { ...identity, members }, manifest: {
        ...identity, created_at, application_version: request.application_version, selected_evidence: draft.selected_evidence,
        publication_status: 'JSON_ONLY_PUBLISHED' as const, delivery_status: 'INCOMPLETE' as const,
        readiness: { rule_version: BLOG_V2_PUBLICATION_RULE_VERSION, evaluated_at: created_at, verdict: 'SATISFIED' as const, evaluation: readiness },
      } };
    });
    return { status: 'PUBLISHED', publication };
  } catch (error) {
    if (error instanceof PublicationBlocked) return { status: 'BLOCKED', readiness: error.readiness };
    throw error;
  }
};
