import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="flex h-[100svh] w-full overflow-hidden">
      <div className="flex w-56 items-center justify-center bg-gray-900 px-4 text-lg font-semibold text-yellow-300">
        Inserted to test
      </div>
      <div className="flex-1 overflow-hidden">
        <CausalGraph />
      </div>
    </div>
  );
};

export default Index;
