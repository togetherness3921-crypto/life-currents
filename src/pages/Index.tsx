import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="fixed left-4 top-1/2 -translate-y-1/2 transform text-3xl font-bold text-yellow-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] pointer-events-none z-50">
        Inserted to test
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
