import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 bg-black/70 px-4 py-3 text-xl font-semibold text-yellow-300">
        Inserted to test
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
