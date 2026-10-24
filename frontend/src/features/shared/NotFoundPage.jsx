import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="content-panel" aria-labelledby="not-found-title">
      <p className="eyebrow">Page not found</p>
      <h2 id="not-found-title">That page isn&apos;t here</h2>
      <p>Check the address or return to your overview.</p>
      <Link className="text-link" to="/">Go to overview</Link>
    </section>
  );
}
