import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 text-center">
      <p className="mb-4 text-sm uppercase tracking-widest text-zinc-500">
        Керамическая мастерская Аскара
      </p>
      <h1 className="mb-6 max-w-3xl text-4xl font-bold leading-tight text-zinc-900 md:text-6xl">
        Штампы и инструменты для&nbsp;керамики
      </h1>
      <p className="mb-10 max-w-xl text-lg text-zinc-600">
        Алфавиты, узоры, текстурные ролики и инструменты для керамистов — от
        любителей до студий.
      </p>
      <Link
        href="/catalog"
        className="inline-flex items-center rounded-full bg-zinc-900 px-8 py-4 font-medium text-white transition hover:bg-zinc-700"
      >
        Открыть каталог
      </Link>
    </main>
  );
}
