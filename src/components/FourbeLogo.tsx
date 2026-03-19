export function FourbeLogo() {
  return (
    <div className="flex flex-col gap-1.5">
      {/* Top row - Full F top */}
      <div className="flex gap-1.5">
        <div className="w-14 h-14 bg-[#6aaa64] rounded"></div>
        <div className="w-14 h-14 bg-[#6aaa64] rounded"></div>
        <div className="w-14 h-14 bg-[#6aaa64] rounded"></div>
      </div>
      
      {/* Middle row - F vertical stem */}
      <div className="flex gap-1.5">
        <div className="w-14 h-14 bg-[#6aaa64] rounded"></div>
        <div className="w-14 h-14 border-2 border-[#5b9bd5] rounded"></div>
        <div className="w-14 h-14 border-2 border-[#5b9bd5] rounded"></div>
      </div>
      
      {/* Middle row 2 - F horizontal bar */}
      <div className="flex gap-1.5">
        <div className="w-14 h-14 bg-[#6aaa64] rounded"></div>
        <div className="w-14 h-14 bg-[#6aaa64] rounded"></div>
        <div className="w-14 h-14 border-2 border-[#5b9bd5] rounded"></div>
      </div>
      
      {/* Bottom row - F vertical stem */}
      <div className="flex gap-1.5">
        <div className="w-14 h-14 bg-[#6aaa64] rounded"></div>
        <div className="w-14 h-14 border-2 border-[#5b9bd5] rounded"></div>
        <div className="w-14 h-14 border-2 border-[#5b9bd5] rounded"></div>
      </div>
    </div>
  );
}