import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
      <span className="text-[6rem]" aria-hidden>
        ☕
      </span>
      <h1 className="text-display text-5xl text-crema-50">We couldn&apos;t find that page</h1>
      <Link href="/" data-gesture-target className="btn btn-primary gesture-target">
        Back to start
      </Link>
    </div>
  );
}
