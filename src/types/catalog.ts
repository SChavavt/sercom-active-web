export type EditorialStatus = 'draft' | 'in_review' | 'approved' | 'retired';
export interface Category {
  id: string;
  name: string;
  status: 'draft' | 'approved';
}
export interface Product {
  id: string;
  brandId: string;
  model: string;
  name: string;
  categoryIds: string[];
  status: EditorialStatus;
  description?: string;
  characteristics?: string[];
  saleUnit?: string;
  variants?: { id: string; label: string; manufacturerCode: string }[];
  image?: { url: string; alt: string; sourceUrl: string; usageConfirmed: boolean };
  source?: { url: string; checkedOn: string };
  approval?: { by: string; on: string; supplyConfirmed: boolean };
  documents?: { label: string; url: string }[];
}
export interface Catalog {
  schemaVersion: 1;
  categories: Category[];
  products: Product[];
}
