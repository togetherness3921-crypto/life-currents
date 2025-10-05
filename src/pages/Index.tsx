import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <div className="absolute left-4 top-4 z-50 text-2xl font-bold text-yellow-400 drop-shadow-md">
        Inserted to test
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
