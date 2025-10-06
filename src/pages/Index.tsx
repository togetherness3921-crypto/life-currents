import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 select-none text-2xl font-bold text-yellow-300 drop-shadow-[0_0_6px_rgba(0,0,0,0.8)]">
        Inserted to test
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
