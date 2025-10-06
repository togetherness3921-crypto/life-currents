import CausalGraph from "@/components/CausalGraph";
import PreviewBuildsWidget from "@/components/builds/PreviewBuildsWidget";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="pointer-events-none absolute left-4 top-1/2 z-50 -translate-y-1/2 text-3xl font-semibold text-yellow-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]">
        Inserted to test
      </div>
      <CausalGraph />
      <PreviewBuildsWidget />
    </div>
  );
};

export default Index;
