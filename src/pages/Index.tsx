import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 transform rounded-md bg-black/60 px-4 py-2 text-2xl font-bold text-yellow-300">
        Inserted to test
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
