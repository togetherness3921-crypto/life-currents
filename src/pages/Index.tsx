import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="absolute left-0 top-1/2 z-50 -translate-y-1/2 bg-black/70 p-4 text-lg font-semibold text-yellow-300">
        Inserted to test
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
