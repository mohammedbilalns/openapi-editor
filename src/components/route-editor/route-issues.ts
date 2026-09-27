/**
 * Validation issues for the route editor (BLUEPRINT §2.6), from agent D's
 * analysis module. Route fields: `path`, `operationId`, `responses`,
 * `requestBody`, `param:{paramId}`, `response:{code}`.
 */
export { countIssues, fieldIssues, issueField, issueProps, useIssuesFor } from '@/lib/openapi/analysis'
export type { Issue as RouteIssue } from '@/lib/openapi/analysis'
