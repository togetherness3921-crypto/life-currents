import CausalGraph from "@/components/CausalGraph";
import PreviewBuildsManager from "@/components/preview-builds/PreviewBuildsManager";

const Index = () => {
  return (
    <div className="h-[100svh] w-full overflow-hidden">
      <CausalGraph />
      <PreviewBuildsManager />
    </div>
  );
};

export default Index;
