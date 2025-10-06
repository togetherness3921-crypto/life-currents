import CausalGraph from "@/components/CausalGraph";
import PreviewBuildsWidget from "@/components/builds/PreviewBuildsWidget";

const Index = () => {
  return (
    <div className="h-[100svh] w-full overflow-hidden">
      <div className="pointer-events-none fixed left-4 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-black/70 px-4 py-2 text-3xl font-bold text-yellow-400 drop-shadow-lg">
        Inserted to test
      </div>
      <CausalGraph />
      <PreviewBuildsWidget />
    </div>
  );
};

export default Index;
