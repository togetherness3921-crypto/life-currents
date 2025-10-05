import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="flex h-[100svh] w-full overflow-hidden">
      <div className="flex items-start justify-center bg-black p-4 text-xl font-semibold text-yellow-300">
        Inserted to test
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <CausalGraph />
      </div>
    </div>
  );
};

export default Index;
