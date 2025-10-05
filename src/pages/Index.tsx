import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center bg-black/70 px-6 text-3xl font-bold uppercase tracking-wide text-yellow-300 drop-shadow-lg">
        Inserted to test
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
