import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="h-[100svh] w-full overflow-hidden">
      <div className="fixed left-6 top-1/2 -translate-y-1/2 text-yellow-300 text-3xl font-semibold drop-shadow-lg z-50 pointer-events-none select-none">
        Inserted to test
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
