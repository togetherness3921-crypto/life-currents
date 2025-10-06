import CausalGraph from "@/components/CausalGraph";
import PreviewBuildsWidget from "@/components/builds/PreviewBuildsWidget";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-4xl font-extrabold uppercase text-yellow-300 drop-shadow-lg">
        Inserted to test
      </div>
      <CausalGraph />
      <PreviewBuildsWidget />
    </div>
  );
};

export default Index;
