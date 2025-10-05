import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-yellow-300 drop-shadow-lg">
        Inserted to test
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
