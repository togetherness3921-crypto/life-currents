import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="fixed left-4 top-1/2 z-50 -translate-y-1/2 text-3xl font-bold text-yellow-400 drop-shadow-[0_0_6px_rgba(0,0,0,0.75)]">
        Inserted to test
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
