import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-yellow-400 drop-shadow">
        Inserted to test
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
