import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { CategoryFilter } from "@/components/CategoryFilter";
import productsData from "@/data/products.json";
import type { Product } from "@/types";

// Импортируем JSON с товарами. TypeScript сам понимает структуру.
// Приводим типы, чтобы получить полный автокомплит по полям Product.
const products = productsData.products as Product[];

export const metadata = {
  title: "Каталог — Штампы для керамики",
};

export default function CatalogPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 md:py-16">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold md:text-4xl">Каталог</h1>
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← На главную
        </Link>
      </div>

      {/* На главной /catalog активна вкладка «Все» — передаём active=null */}
      <CategoryFilter active={null} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </main>
  );
}
