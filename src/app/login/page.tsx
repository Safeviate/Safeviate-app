import { Suspense } from 'react';
import LoginClient from './login-client';

function LoginFallback() {
  return (
    <div className="relative min-h-screen bg-[#050d19] text-white">
      <div className="absolute inset-0 opacity-80" style={{ backgroundImage: 'linear-gradient(rgba(54,121,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(54,121,255,0.08) 1px, transparent 1px)', backgroundSize: '38px 38px' }} />
      <div className="relative z-10 mx-auto max-w-[1280px] px-3 py-3 md:px-5">
        <div className="mb-3 h-20 rounded-[1.35rem] border border-blue-400/20 bg-[#071326]/92" />
        <div className="grid gap-3 lg:grid-cols-[1.05fr_1.15fr]">
          <div className="h-[320px] rounded-[1.5rem] border border-blue-400/20 bg-[#08162d]" />
          <div className="h-[320px] rounded-[1.5rem] border border-blue-400/20 bg-[#08162d]" />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="h-40 rounded-[1.2rem] border border-blue-400/20 bg-[#08162d]" />
          <div className="h-40 rounded-[1.2rem] border border-blue-400/20 bg-[#08162d]" />
          <div className="h-40 rounded-[1.2rem] border border-blue-400/20 bg-[#08162d]" />
          <div className="h-40 rounded-[1.2rem] border border-blue-400/20 bg-[#08162d]" />
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-3">
          <div className="h-[640px] rounded-[1.35rem] border border-blue-400/20 bg-[#08162d]" />
          <div className="h-[640px] rounded-[1.35rem] border border-blue-400/20 bg-[#08162d]" />
          <div className="h-[640px] rounded-[1.35rem] border border-blue-400/20 bg-[#08162d]" />
        </div>
        <div className="mt-3 h-[280px] rounded-[1.35rem] border border-blue-400/20 bg-[#08162d]" />
        <div className="mt-3 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="h-[360px] rounded-[1.35rem] border border-blue-400/20 bg-[#08162d]" />
          <div className="h-[360px] rounded-[1.35rem] border border-blue-400/20 bg-[#08162d]" />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginClient />
    </Suspense>
  );
}
