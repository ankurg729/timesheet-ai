import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

export function createSampleTimesheetBuffer(): Buffer {
  const sampleData = [
    {
      'Work Date': '2026-06-05',
      'Issue Key': 'CORE-12',
      'Summary': 'OAuth SSO Integration',
      'Work Description': 'Configured Okta SSO and JWT token refresh mechanism for API security',
      'Worklog Comment': 'Setup OAuth 2.0 flow with PKCE',
      'Hours Spent': 6,
      'Project Name': 'Core',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-06-08',
      'Issue Key': 'CORE-12',
      'Summary': 'OAuth SSO Integration',
      'Work Description': 'Unit tests and token expiration handling on frontend and backend',
      'Worklog Comment': 'Completed refresh token rotation logic',
      'Hours Spent': 4,
      'Project Name': 'Core',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-06-15',
      'Issue Key': 'PROV-55',
      'Summary': 'Provider Registration Flow',
      'Work Description': 'Multi-step registration wizard for medical healthcare providers and clinic onboarding',
      'Worklog Comment': 'Created step 1 and step 2 of registration form with reactive form validation',
      'Hours Spent': 8,
      'Project Name': 'Provider Registration',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-06-16',
      'Issue Key': 'PROV-55',
      'Summary': 'Provider Registration Flow',
      'Work Description': 'Implemented taxonomy code lookup and address autocomplete API integration',
      'Worklog Comment': 'Integrated Google Places address lookup and taxonomy dropdowns',
      'Hours Spent': 7.5,
      'Project Name': 'Provider Registration',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-06-22',
      'Issue Key': 'PROV-92',
      'Summary': 'Provider Credential Verification',
      'Work Description': 'Validating NPI numbers, state licenses, and automated DEA registry verification',
      'Worklog Comment': 'Built backend NPI registry lookup API client',
      'Hours Spent': 5,
      'Project Name': 'Provider Registration',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-07-02',
      'Issue Key': 'PRE-204',
      'Summary': 'PreAuth Claim Verification',
      'Work Description': 'Integrated eligibility checks and pre-authorization claim rule engine',
      'Worklog Comment': 'Built CPT and ICD-10 medical code validation rule engine',
      'Hours Spent': 8,
      'Project Name': 'PreAuth',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-07-03',
      'Issue Key': 'PRE-204',
      'Summary': 'PreAuth Claim Verification',
      'Work Description': 'Payer response parsing and automatic prior authorization recommendation algorithms',
      'Worklog Comment': 'Added rule evaluation for standard urgent vs elective preauth criteria',
      'Hours Spent': 8,
      'Project Name': 'PreAuth',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-07-09',
      'Issue Key': 'PRE-310',
      'Summary': 'PreAuth Document Attachment',
      'Work Description': 'Added drag and drop supporting medical document upload for preauth claims',
      'Worklog Comment': 'Implemented S3 presigned URL upload with antivirus scan hook',
      'Hours Spent': 6,
      'Project Name': 'PreAuth',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-07-10',
      'Issue Key': 'PRE-310',
      'Summary': 'PreAuth Document Attachment',
      'Work Description': 'PDF preview component and DICOM medical image viewer integration',
      'Worklog Comment': 'Added thumbnail generation and patient record redaction',
      'Hours Spent': 7,
      'Project Name': 'PreAuth',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-07-20',
      'Issue Key': 'PAM-101',
      'Summary': 'PAM User Access Management',
      'Work Description': 'Privileged access management dashboard for role assignment and elevation',
      'Worklog Comment': 'Implemented role-based permission matrix and audit trail',
      'Hours Spent': 7.5,
      'Project Name': 'PAM',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-08-03',
      'Issue Key': 'PAM-105',
      'Summary': 'Performance Optimization',
      'Work Description': 'Profiling bundle sizes, lazy loading routes, reducing re-renders on dashboard',
      'Worklog Comment': 'Reduced initial bundle size by 38% using route-level lazy loading',
      'Hours Spent': 8,
      'Project Name': 'PAM',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-08-04',
      'Issue Key': 'PAM-105',
      'Summary': 'Performance Optimization',
      'Work Description': 'Virtual scrolling for 10k+ rows table and OnPush change detection strategy',
      'Worklog Comment': 'Configured CDK virtual scroll viewport and removed unnecessary ngDoCheck triggers',
      'Hours Spent': 6,
      'Project Name': 'PAM',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-08-11',
      'Issue Key': 'PAM-382',
      'Summary': 'Skeleton Loading',
      'Work Description': 'Implemented shimmer effect and skeleton screen loading for timesheet cards to improve perceived performance',
      'Worklog Comment': 'Created animated CSS shimmer gradients for card placeholders',
      'Hours Spent': 7,
      'Project Name': 'PAM',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-08-12',
      'Issue Key': 'PAM-382',
      'Summary': 'Skeleton Loading',
      'Work Description': 'Integrated skeleton loading state with Angular Signals and HTTP interceptor status',
      'Worklog Comment': 'Fine-tuned loading animations to prevent layout shifts (CLS < 0.05)',
      'Hours Spent': 7,
      'Project Name': 'PAM',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-08-13',
      'Issue Key': 'PAM-382',
      'Summary': 'Skeleton Loading',
      'Work Description': 'Cross-browser accessibility testing and dark mode styling for skeleton elements',
      'Worklog Comment': 'Added reduced-motion query support for accessibility compliance',
      'Hours Spent': 6,
      'Project Name': 'PAM',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-08-20',
      'Issue Key': 'PAM-210',
      'Summary': 'Timesheet Approval Workflow',
      'Work Description': 'Built manager approval flow, rejection modal with mandatory notes, and notification banners',
      'Worklog Comment': 'Added email dispatch upon timesheet submission and approval status change',
      'Hours Spent': 7,
      'Project Name': 'PAM',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-08-21',
      'Issue Key': 'PAM-210',
      'Summary': 'Timesheet Approval Workflow',
      'Work Description': 'Bulk approval feature for team leads with summary metrics',
      'Worklog Comment': 'Optimized bulk update mutation endpoint',
      'Hours Spent': 5,
      'Project Name': 'PAM',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-09-02',
      'Issue Key': 'PAM-382',
      'Summary': 'Skeleton Loading',
      'Work Description': 'Edge case handling for fast 3G network conditions and skeleton flicker prevention',
      'Worklog Comment': 'Introduced 200ms minimum debounce timer to avoid UI flicker on fast responses',
      'Hours Spent': 4,
      'Project Name': 'PAM',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-09-10',
      'Issue Key': 'PRE-204',
      'Summary': 'PreAuth Claim Verification',
      'Work Description': 'Automated retry for timed-out payer clearinghouse connections',
      'Worklog Comment': 'Exponential backoff policy implemented for clearinghouse SOAP/REST gateway',
      'Hours Spent': 6,
      'Project Name': 'PreAuth',
      'Logged By': 'Alex Morgan',
    },
    {
      'Work Date': '2026-09-15',
      'Issue Key': 'PROV-55',
      'Summary': 'Provider Registration Flow',
      'Work Description': 'Document upload step validation and sanitization for medical licenses',
      'Worklog Comment': 'Added file size check and virus scanner pipeline',
      'Hours Spent': 5.5,
      'Project Name': 'Provider Registration',
      'Logged By': 'Alex Morgan',
    },
    {
      // Deliberate duplicate row to test deduplication
      'Work Date': '2026-09-15',
      'Issue Key': 'PROV-55',
      'Summary': 'Provider Registration Flow',
      'Work Description': 'Document upload step validation and sanitization for medical licenses',
      'Worklog Comment': 'Added file size check and virus scanner pipeline',
      'Hours Spent': 5.5,
      'Project Name': 'Provider Registration',
      'Logged By': 'Alex Morgan',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Timesheet');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

// If run directly via node/tsx
const isMain = process.argv[1]?.includes('generate-sample-data');
if (isMain) {
  const targetDir = path.resolve(process.cwd(), '../test-data');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const buffer = createSampleTimesheetBuffer();
  const filePath = path.join(targetDir, 'sample_jira_timesheet.xlsx');
  fs.writeFileSync(filePath, buffer);
  console.log(`Successfully generated sample timesheet at: ${filePath}`);
}
