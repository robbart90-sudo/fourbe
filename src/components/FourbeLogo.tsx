export function FourbeLogo() {
  return (
    <div className="flex flex-col gap-1.5">
      {/* Top row - Full F top */}
      <div className="flex gap-1.5">
        <div className="w-10 h-10 bg-player rounded-sm"></div>
        <div className="w-10 h-10 bg-player rounded-sm"></div>
        <div className="w-10 h-10 bg-player rounded-sm"></div>
      </div>

      {/* Middle row - F vertical stem */}
      <div className="flex gap-1.5">
        <div className="w-10 h-10 bg-player rounded-sm"></div>
        <div className="w-10 h-10 border-2 border-[#c9bfb0] rounded-sm"></div>
        <div className="w-10 h-10 border-2 border-[#c9bfb0] rounded-sm"></div>
      </div>

      {/* Middle row 2 - F horizontal bar */}
      <div className="flex gap-1.5">
        <div className="w-10 h-10 bg-player rounded-sm"></div>
        <div className="w-10 h-10 bg-player rounded-sm"></div>
        <div className="w-10 h-10 border-2 border-[#c9bfb0] rounded-sm"></div>
      </div>

      {/* Bottom row - F vertical stem */}
      <div className="flex gap-1.5">
        <div className="w-10 h-10 bg-player rounded-sm"></div>
        <div className="w-10 h-10 border-2 border-[#c9bfb0] rounded-sm"></div>
        <div className="w-10 h-10 border-2 border-[#c9bfb0] rounded-sm"></div>
      </div>
    </div>
  );
}
