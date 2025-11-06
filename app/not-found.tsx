import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="text-4xl font-bold">404 – Page not found</h1>
      <p className="mt-3 text-gray-600">The page you are looking for does not exist.</p>
      <Link href="/" className="mt-6 text-blue-600 underline">
        Go home
      </Link>
    </section>
  );
}


