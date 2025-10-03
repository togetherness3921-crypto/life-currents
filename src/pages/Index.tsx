import CausalGraph from "@/components/CausalGraph";
import PreviewBuildsWidget from "@/components/builds/PreviewBuildsWidget";

const Index = () => {
  return (
    <div className="h-[100svh] w-full overflow-hidden">
      <CausalGraph />
      <PreviewBuildsWidget />
    </div>
  );
};

export default Index;
