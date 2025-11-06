import Link from 'next/link';

export default function HomePage() {
  return (
    <section className="py-16">
      <h1 className="text-4xl font-bold">Hello, Citia 👋</h1>
      <p className="mt-4 text-gray-600">Welcome to the minimal Metagapura Portal.</p>
      <div className="mt-8">
        <Link href="/status" className="text-blue-600 underline">
          View status
        </Link>
      </div>
    </section>
  );
}


