import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 px-4 text-3xl font-extrabold uppercase tracking-wide text-yellow-300 drop-shadow-lg">
        Inserted to test
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
