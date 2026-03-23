import { useState } from 'react';
import { FourbeLogo } from './FourbeLogo';

export function ComingSoon() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    const emails: string[] = JSON.parse(localStorage.getItem('fourbe-notify-emails') || '[]');
    if (!emails.includes(email.trim())) {
      emails.push(email.trim());
      localStorage.setItem('fourbe-notify-emails', JSON.stringify(emails));
    }
    setSubmitted(true);
  }

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

      <div className="mt-10 w-full max-w-xs">
        {submitted ? (
          <p
            className="text-center text-[#6aaa64]"
            style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 14 }}
          >
            We'll let you know when we launch!
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-[#6aaa64]"
              style={{ fontFamily: 'var(--font-sans)' }}
            />
            <button
              type="submit"
              className="w-full py-3 bg-[#6aaa64] text-white rounded text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity border-none"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Notify Me
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
