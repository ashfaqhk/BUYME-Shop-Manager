export type Variant = {
  id: string;
  name: string;
  image?: string;
  price: number;
  stock?: number;
  threshold?: number;
  unit: string;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  image?: string;
  variants: Variant[];
  updatedAt: string;
};

export const categories = ['All items', 'Grocery', 'Beverages', 'Snacks', 'Dairy', 'Bakery', 'Produce', 'Household', 'Stationery'];

export const seedCatalog: Product[] = [
  { id: 'p1', name: 'Aashirvaad Atta', category: 'Grocery', image: 'products/aashirvaad-atta.jpg', updatedAt: 'Today', variants: [
    { id: 'v1', name: '5 kg', price: 285, stock: 14, threshold: 5, unit: 'bag' },
    { id: 'v2', name: '10 kg', price: 520, stock: 7, threshold: 3, unit: 'bag' },
  ] },
  { id: 'p2', name: 'Tata Salt', category: 'Grocery', image: 'products/tata-salt.jpg', updatedAt: 'Today', variants: [
    { id: 'v3', name: '1 kg', price: 28, stock: 34, threshold: 8, unit: 'pack' },
  ] },
  { id: 'p3', name: 'Fortune Sunflower Oil', category: 'Grocery', image: 'products/sunflower-oil.jpg', updatedAt: 'Today', variants: [
    { id: 'v4', name: '1 L', price: 146, stock: 9, threshold: 4, unit: 'bottle' },
    { id: 'v5', name: '5 L', price: 698, stock: 3, threshold: 2, unit: 'jar' },
  ] },
  { id: 'p4', name: 'Thums Up', category: 'Beverages', image: 'products/cola.jpg', updatedAt: 'Today', variants: [
    { id: 'v6', name: '750 ml', price: 40, stock: 18, threshold: 6, unit: 'bottle' },
    { id: 'v7', name: '2.25 L', price: 95, stock: 4, threshold: 4, unit: 'bottle' },
  ] },
  { id: 'p5', name: 'Parle-G Biscuits', category: 'Snacks', image: 'products/biscuits.jpg', updatedAt: 'Today', variants: [
    { id: 'v8', name: '800 g', price: 80, stock: 26, threshold: 8, unit: 'pack' },
  ] },
  { id: 'p6', name: 'Nandini Curd', category: 'Dairy', image: 'products/curd.jpg', updatedAt: 'Today', variants: [
    { id: 'v9', name: '500 g', price: 32, stock: 2, threshold: 6, unit: 'cup' },
  ] },
  { id: 'p7', name: 'Kurkure Masala Munch', category: 'Snacks', image: 'products/snacks.jpg', updatedAt: 'Today', variants: [
    { id: 'v10', name: '90 g', price: 20, stock: 21, threshold: 5, unit: 'pack' },
  ] },
  { id: 'p8', name: 'Red Label Tea', category: 'Grocery', image: 'products/tea.jpg', updatedAt: 'Today', variants: [
    { id: 'v11', name: '250 g', price: 118, stock: 8, threshold: 3, unit: 'pack' },
  ] },
  { id: 'p9', name: 'Basmati Rice', category: 'Grocery', image: 'products/rice.jpg', updatedAt: 'Today', variants: [
    { id: 'v12', name: '1 kg', price: 95, stock: 30, threshold: 6, unit: 'pack' },
    { id: 'v13', name: '5 kg', price: 435, stock: 14, threshold: 4, unit: 'bag' },
  ] },
  { id: 'p10', name: 'Red Onions', category: 'Produce', image: 'products/onions.jpg', updatedAt: 'Today', variants: [
    { id: 'v14', name: '1 kg', price: 35, stock: 12, threshold: 5, unit: 'kg' },
  ] },
  { id: 'p11', name: 'Instant Coffee', category: 'Beverages', image: 'products/coffee.jpg', updatedAt: 'Today', variants: [
    { id: 'v15', name: '100 g', price: 185, stock: 16, threshold: 4, unit: 'jar' },
  ] },
  { id: 'p12', name: 'Notebook', category: 'Stationery', image: 'products/notebook.jpg', updatedAt: 'Today', variants: [
    { id: 'v16', name: '100 pages', price: 30, stock: 22, threshold: 5, unit: 'piece' },
    { id: 'v17', name: '200 pages', price: 55, stock: 15, threshold: 5, unit: 'piece' },
  ] },
  { id: 'p13', name: 'Fresh Milk', category: 'Dairy', image: 'products/milk.jpg', updatedAt: 'Today', variants: [
    { id: 'v18', name: '500 ml', price: 30, stock: 18, threshold: 6, unit: 'pack' },
    { id: 'v19', name: '1 L', price: 58, stock: 12, threshold: 4, unit: 'pack' },
  ] },
  { id: 'p14', name: 'Sandwich Bread', category: 'Bakery', image: 'products/bread.jpg', updatedAt: 'Today', variants: [
    { id: 'v20', name: '400 g', price: 42, stock: 14, threshold: 4, unit: 'loaf' },
  ] },
  { id: 'p15', name: 'Farm Eggs', category: 'Dairy', image: 'products/eggs.jpg', updatedAt: 'Today', variants: [
    { id: 'v21', name: '6 pieces', price: 48, stock: 16, threshold: 4, unit: 'tray' },
  ] },
  { id: 'p16', name: 'Instant Noodles', category: 'Snacks', image: 'products/noodles.jpg', updatedAt: 'Today', variants: [
    { id: 'v22', name: '70 g', price: 15, stock: 38, threshold: 8, unit: 'pack' },
  ] },
  { id: 'p17', name: 'Toor Dal', category: 'Grocery', image: 'products/lentils.jpg', updatedAt: 'Today', variants: [
    { id: 'v23', name: '1 kg', price: 160, stock: 17, threshold: 5, unit: 'pack' },
  ] },
  { id: 'p18', name: 'Chickpeas', category: 'Grocery', image: 'products/chickpeas.jpg', updatedAt: 'Today', variants: [
    { id: 'v24', name: '1 kg', price: 110, stock: 19, threshold: 5, unit: 'pack' },
  ] },
  { id: 'p19', name: 'Chilli Powder', category: 'Grocery', image: 'products/spice.jpg', updatedAt: 'Today', variants: [
    { id: 'v25', name: '100 g', price: 45, stock: 15, threshold: 4, unit: 'pack' },
  ] },
  { id: 'p20', name: 'Potatoes', category: 'Produce', image: 'products/potatoes.jpg', updatedAt: 'Today', variants: [
    { id: 'v26', name: '1 kg', price: 32, stock: 25, threshold: 7, unit: 'kg' },
  ] },
  { id: 'p21', name: 'Tomatoes', category: 'Produce', image: 'products/tomatoes.jpg', updatedAt: 'Today', variants: [
    { id: 'v27', name: '1 kg', price: 40, stock: 19, threshold: 5, unit: 'kg' },
  ] },
  { id: 'p22', name: 'Bananas', category: 'Produce', image: 'products/bananas.jpg', updatedAt: 'Today', variants: [
    { id: 'v28', name: '6 pieces', price: 45, stock: 21, threshold: 6, unit: 'bunch' },
  ] },
  { id: 'p23', name: 'Laundry Detergent', category: 'Household', image: 'products/detergent.jpg', updatedAt: 'Today', variants: [
    { id: 'v29', name: '1 kg', price: 125, stock: 11, threshold: 3, unit: 'pack' },
  ] },
  { id: 'p24', name: 'Bath Soap', category: 'Household', image: 'products/soap.jpg', updatedAt: 'Today', variants: [
    { id: 'v30', name: '100 g', price: 38, stock: 27, threshold: 7, unit: 'bar' },
  ] },
];

const seedById = new Map(seedCatalog.map((product) => [product.id, product]));

export function readCatalog(): Product[] {
  const stored = window.localStorage.getItem('buyme-catalog');
  // Sample products are only for a brand-new shop. Never add them to a saved catalog,
  // including a deliberately empty one.
  if (stored === null) return seedCatalog;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const previous = parsed as Product[];
    return previous.map((product) => ({
      ...product,
      image: product.image ?? (seedById.get(product.id)?.name === product.name ? seedById.get(product.id)?.image : undefined),
    }));
  } catch {
    return [];
  }
}
