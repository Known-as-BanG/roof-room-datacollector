import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import * as path from 'node:path';
import { BLOG_V2_PUBLICATION_RULE_VERSION, type BlogV2FileReference, type PublishedBlogWritingPackV2 } from '../../shared/blog-writing-pack-v2-publication';
import { BLOG_WRITING_PACK_V2_MANDATORY_DATASETS } from '../../shared/blog-writing-pack-v2-readiness';
import { parseBlogWritingPackV2Draft } from './blog-writing-pack-v2-draft';

export const blogV2JsonBytes = (value: unknown): Uint8Array => new TextEncoder().encode(`${JSON.stringify(value, (_key, item: unknown) => {
  if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Invalid non-finite publication value.');
  return item;
}, 2)}\n`);

export const blogV2FileReference = (relative_path: string, bytes: Uint8Array): BlogV2FileReference => ({
  relative_path, byte_size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'),
});

export const requireBlogV2FileReference = (value: BlogV2FileReference): void => {
  if (!value || typeof value.relative_path !== 'string'
    || !(value.relative_path === 'payload.json' || /^evidence\/[0-9]{6,}\/(?:raw\.bin|acquisition-metadata\.json)$/u.test(value.relative_path))
    || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.sha256)
    || !Number.isSafeInteger(value.byte_size) || value.byte_size < 0) throw new Error('Invalid or unsafe v2 evidence file reference.');
};

export const blocksBlogV2Publication = (blocker: { mandatory: boolean; code: string }): boolean => blocker.mandatory
  || ['MEMBERSHIP_CHANGED', 'EVIDENCE_INVALID', 'ARTIFACT_INTEGRITY_FAILED', 'FIELD_REPRESENTATION_INVALID'].includes(blocker.code);

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const instant = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export const validateBlogV2Publication = (value: PublishedBlogWritingPackV2, expected_id: string): void => {
  const { manifest, payload } = value ?? {};
  if (!record(manifest) || !record(payload)) throw new Error('Invalid v2 publication documents.');
  for (const document of [manifest, payload]) {
    if (document.schema_version !== '2.0' || document.recipe_id !== 'BLOG_WRITING_PACK' || document.recipe_version !== 2
      || document.package_id !== expected_id || typeof document.workspace_id !== 'string' || !document.workspace_id
      || typeof document.draft_id !== 'string' || !document.draft_id) throw new Error('Invalid v2 publication identity.');
  }
  if (manifest.workspace_id !== payload.workspace_id || manifest.draft_id !== payload.draft_id
    || !instant(manifest.created_at) || typeof manifest.application_version !== 'string' || !manifest.application_version
    || manifest.publication_status !== 'JSON_ONLY_PUBLISHED' || manifest.delivery_status !== 'INCOMPLETE'
    || !Array.isArray(manifest.selected_evidence) || !Array.isArray(manifest.files) || !Array.isArray(payload.members)) {
    throw new Error('Invalid v2 publication metadata.');
  }
  parseBlogWritingPackV2Draft({ draft_version: 1, recipe_id: 'BLOG_WRITING_PACK', recipe_version: 2,
    package_id: manifest.draft_id, workspace_id: manifest.workspace_id, created_at: manifest.created_at,
    application_version: manifest.application_version, state: 'DRAFT', readiness_status: 'NOT_EVALUATED', selected_evidence: manifest.selected_evidence });
  const readiness = manifest.readiness;
  if (!record(readiness) || readiness.rule_version !== BLOG_V2_PUBLICATION_RULE_VERSION || readiness.verdict !== 'SATISFIED'
    || readiness.evaluated_at !== manifest.created_at || !record(readiness.evaluation)) throw new Error('Invalid publication readiness snapshot.');
  const evaluation = readiness.evaluation;
  if (evaluation.evaluation_version !== 1 || evaluation.recipe_version !== 2 || evaluation.evaluation_phase !== 'PUBLICATION'
    || evaluation.evaluated_at !== manifest.created_at || evaluation.workspace_id !== manifest.workspace_id
    || evaluation.draft_package_id !== manifest.draft_id || evaluation.coverage_status !== 'COMPLETE'
    || evaluation.coverage_scope !== 'EXPLICIT_REQUIREMENTS_ONLY' || evaluation.delivery_readiness !== 'NOT_EVALUATED'
    || !Array.isArray(evaluation.blockers) || evaluation.blockers.some((blocker) => !record(blocker) || blocker.mandatory !== false || blocksBlogV2Publication(blocker))
    || !Array.isArray(evaluation.datasets) || !isDeepStrictEqual(evaluation.selected_evidence, manifest.selected_evidence)) {
    throw new Error('Blocked or invalid publication readiness.');
  }
  if (!isDeepStrictEqual(evaluation.datasets.map((item) => item.dataset_type), [...BLOG_WRITING_PACK_V2_MANDATORY_DATASETS])) {
    throw new Error('Invalid mandatory publication dataset assessment.');
  }
  for (const dataset of evaluation.datasets) {
    const count = manifest.selected_evidence.filter((item) => item.dataset_type === dataset.dataset_type).length;
    if (dataset.coverage_status !== 'SATISFIED' || count === 0 || dataset.selected_count !== count || dataset.usable_count !== count) {
      throw new Error('Mandatory publication dataset is not ready.');
    }
  }
  if (!isDeepStrictEqual(payload.members.map((member) => member.evidence), manifest.selected_evidence)) throw new Error('Invalid frozen publication membership.');
  const expectedFiles = ['payload.json'];
  payload.members.forEach((member, index) => {
    const directory = `evidence/${String(index).padStart(6, '0')}`;
    requireBlogV2FileReference(member.raw);
    if (member.raw.relative_path !== `${directory}/raw.bin` || member.raw.sha256 !== member.evidence.artifact_sha256
      || member.raw.byte_size !== member.evidence.artifact_byte_size) throw new Error('Invalid publication raw integrity identity.');
    expectedFiles.push(member.raw.relative_path);
    const acquisition = member.evidence.serp_acquisition ?? member.evidence.gsc_date_coverage;
    if (acquisition) {
      if (!member.acquisition_metadata) throw new Error('Missing publication acquisition metadata.');
      requireBlogV2FileReference(member.acquisition_metadata);
      if (member.acquisition_metadata.relative_path !== `${directory}/acquisition-metadata.json`
        || member.acquisition_metadata.sha256 !== acquisition.metadata_sha256
        || member.acquisition_metadata.byte_size !== acquisition.metadata_byte_size) throw new Error('Invalid acquisition metadata integrity.');
      expectedFiles.push(member.acquisition_metadata.relative_path);
    } else if (member.acquisition_metadata) throw new Error('Unbound publication acquisition metadata.');
    if (!record(member.normalized) || typeof member.normalized.implementation !== 'string' || !member.normalized.implementation
      || !Array.isArray(member.normalized.rows) || !member.normalized.rows.every(record)
      || !record(member.derived) || !Array.isArray(member.derived.rows) || !Array.isArray(member.derived.transformations)) {
      throw new Error('Invalid publication representations.');
    }
    const fields = new Set<string>();
    for (const transformation of member.derived.transformations) {
      if (!record(transformation) || typeof transformation.field !== 'string' || !transformation.field
        || typeof transformation.expression !== 'string' || !transformation.expression || transformation.approved_for_blog !== true
        || fields.has(transformation.field)) throw new Error('Invalid or unapproved publication transformation.');
      fields.add(transformation.field);
    }
    const rowIndices = new Set<number>();
    for (const row of member.derived.rows) {
      if (!record(row) || !Number.isSafeInteger(row.row_index) || row.row_index < 0 || row.row_index >= member.normalized.rows.length
        || rowIndices.has(row.row_index) || !record(row.values) || Object.keys(row.values).some((field) => !fields.has(field))) {
        throw new Error('Invalid derived publication rows.');
      }
      rowIndices.add(row.row_index);
    }
    if (member.normalized.rows.some((row) => [...fields].some((field) => Object.hasOwn(row, field)))) throw new Error('Derived publication fields are not separate.');
  });
  const paths: string[] = [];
  for (const file of manifest.files) { requireBlogV2FileReference(file); paths.push(file.relative_path); }
  if (new Set(paths).size !== paths.length || !isDeepStrictEqual([...paths].sort(), expectedFiles.sort())) throw new Error('Invalid publication file inventory.');
  for (const member of payload.members) for (const file of [member.raw, ...(member.acquisition_metadata ? [member.acquisition_metadata] : [])]) {
    if (!isDeepStrictEqual(manifest.files.find((candidate) => candidate.relative_path === file.relative_path), file)) throw new Error('Invalid publication integrity reference.');
  }
};

export const readBlogV2Publication = async (directory: string, expected_id: string): Promise<PublishedBlogWritingPackV2> => {
  const actualFiles: string[] = [];
  const actualDirectories: string[] = [];
  const walk = async (relative: string): Promise<void> => {
    const absolute = path.join(directory, relative);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error('Symbolic publication file is invalid.');
    if (stat.isDirectory()) {
      if (relative) actualDirectories.push(relative);
      for (const name of await readdir(absolute)) await walk(relative ? `${relative}/${name}` : name);
    } else if (stat.isFile()) actualFiles.push(relative);
    else throw new Error('Invalid publication file type.');
  };
  await walk('');
  let value: PublishedBlogWritingPackV2;
  try {
    value = { payload: JSON.parse(await readFile(path.join(directory, 'payload.json'), 'utf8')),
      manifest: JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')) } as PublishedBlogWritingPackV2;
  } catch { throw new Error('Invalid JSON publication documents.'); }
  validateBlogV2Publication(value, expected_id);
  if (!isDeepStrictEqual(actualFiles.sort(), [...value.manifest.files.map((file) => file.relative_path), 'manifest.json'].sort())) throw new Error('Invalid publication file set.');
  const expectedDirectories = ['evidence', ...value.payload.members.map((_member, index) => `evidence/${String(index).padStart(6, '0')}`)];
  if (!isDeepStrictEqual(actualDirectories.sort(), expectedDirectories.sort())) throw new Error('Invalid publication directory set.');
  for (const expected of value.manifest.files) {
    const bytes = new Uint8Array(await readFile(path.join(directory, expected.relative_path)));
    if (!isDeepStrictEqual(blogV2FileReference(expected.relative_path, bytes), expected)) throw new Error('Publication file integrity failed.');
  }
  return value;
};
