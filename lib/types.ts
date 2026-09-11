// Must match the Lambda validation lists in infra/lambda/create-portfolio-item.ts
// and update-portfolio-item.ts exactly — update all three together if these
// ever change (same convention as sj-web-studio-clean's contact form service
// list needing to match services.html).
export const PACKAGE_OPTIONS = [
  "Brand Identity",
  "Static Site",
  "Editable Site",
  "Full Brand + Site",
  "Site Migration",
  "As-Is Rebuild",
] as const;

export type PackageName = (typeof PACKAGE_OPTIONS)[number];

export interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  images: string[];
  featured: boolean;
  order: number;
  packageName: PackageName;
  industry: string;
}
