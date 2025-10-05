import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="absolute left-0 top-0 z-50 bg-black/60 px-4 py-2 text-xl font-bold text-yellow-300">
        Inserted to test
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
