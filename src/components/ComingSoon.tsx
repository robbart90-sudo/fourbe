import { FourbeLogo } from './FourbeLogo';

export function ComingSoon() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <FourbeLogo />

      <h1
        className="mt-8 tracking-tight text-black"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 48 }}
      >
        Fourbe
      </h1>

      <p
        className="mt-6 text-black"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 28 }}
      >
        Coming Soon
      </p>

      <p
        className="mt-3 text-gray-500 text-center"
        style={{ fontFamily: 'var(--font-serif)', fontSize: 16 }}
      >
        A daily puzzle game. Four clues. One hidden subject.
      </p>

      <a
        href="https://forms.gle/DJ8BP2wqQjaSpniP9"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 text-gray-400 hover:text-gray-600 transition-colors underline"
        style={{ fontFamily: 'var(--font-sans)', fontSize: 14 }}
      >
        Get notified when we launch →
      </a>
    </div>
  );
}
