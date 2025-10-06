import CausalGraph from "@/components/CausalGraph";
import PreviewBuildsWidget from "@/components/builds/PreviewBuildsWidget";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="absolute left-4 top-4 z-50 text-lg font-semibold text-yellow-400">
        Inserted to test
      </div>
      <CausalGraph />
      <PreviewBuildsWidget />
    </div>
  );
};

export default Index;
