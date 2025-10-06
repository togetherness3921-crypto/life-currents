import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="absolute left-4 top-1/2 z-50 -translate-y-1/2 rounded-md bg-black/60 px-4 py-2 text-lg font-semibold text-yellow-300">
        Inserted to test
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
