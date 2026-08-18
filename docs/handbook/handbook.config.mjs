// Handbook build manifest.
//
// Every document the programme produces is declared here. `files` are Markdown
// paths relative to docs/handbook/content/ and are concatenated in order; each
// file becomes one chapter, and its first `# ` heading becomes the chapter title
// in the table of contents.
//
// A file listed here that does not exist yet is skipped with a warning, so the
// build works from step 1 onward rather than only once every chapter is written.

export const brand = {
  company: "Luxus Travel and Tours",
  product: "Luxus Sales System",
  accent: "#0B2A3A",
  accentSoft: "#1a3a4a",
}

/** @type {{slug: string, title: string, subtitle: string, audience: string, files: string[]}[]} */
export const documents = [
  {
    slug: "technical-handover",
    title: "Technical Handover Sheet",
    subtitle: "Stack, services and operating notes for an incoming developer",
    audience: "Incoming developer",
    files: ["technical-handover.md"],
  },
  {
    slug: "consultant-handbook",
    title: "Consultant Handbook",
    subtitle: "Running a booking from enquiry to closed",
    audience: "Sales consultants",
    files: [
      "consultant/01-getting-started.md",
      "consultant/02-customers.md",
      "consultant/03-enquiries.md",
      "consultant/04-quoting.md",
      "consultant/05-reservation-and-guests.md",
      "consultant/06-invoicing-and-payments.md",
      "consultant/07-vouchers-and-closing.md",
      "consultant/08-pipeline-and-gates.md",
    ],
  },
  {
    slug: "administrator-guide",
    title: "Administrator Guide",
    subtitle: "Configuring and maintaining the system",
    audience: "Managers and administrators",
    files: [
      "admin/01-users-and-roles.md",
      "admin/02-company-setup.md",
      "admin/03-suppliers-and-rates.md",
      "admin/04-templates-and-branding.md",
      "admin/05-data-import.md",
    ],
  },
  {
    slug: "automation-and-reporting",
    title: "Automation and Reporting",
    subtitle: "What runs on its own, and where the numbers come from",
    audience: "Managers and administrators",
    files: ["automation-and-reporting.md"],
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting and FAQ",
    subtitle: "When the system will not let you do something",
    audience: "Everyone",
    files: ["troubleshooting.md"],
  },
  {
    slug: "quick-reference",
    title: "Quick Reference Card",
    subtitle: "The booking lifecycle on two pages",
    audience: "Sales consultants",
    files: ["quick-reference.md"],
  },
]

/** The combined edition is every document above, in order, under one cover. */
export const combined = {
  slug: "luxus-system-documentation",
  title: "System Documentation",
  subtitle: "Complete edition — technical, consultant and administrator",
  audience: "Handover record",
  files: documents.flatMap((doc) => doc.files),
}
