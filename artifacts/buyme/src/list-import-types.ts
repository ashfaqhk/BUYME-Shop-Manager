export type DetectedListItem = {
  name: string;
  quantity: number;
  unit: string | null;
  variant: string | null;
  unitPrice: number | null;
};

export type ImportBillLine = {
  name: string;
  variant: string;
  qty: number;
  price: number;
  productId?: string;
  variantId?: string;
};