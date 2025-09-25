import ObjectiveNode from './nodes/ObjectiveNode';
import StartNode from './nodes/StartNode';
import MilestoneNode from './nodes/MilestoneNode';
import ValidationNode from './nodes/ValidationNode';
import GoalNode from './nodes/GoalNode';

const nodeTypes = {
    startNode: StartNode,
    objectiveNode: ObjectiveNode,
    milestoneNode: MilestoneNode,
    validationNode: ValidationNode,
    goalNode: GoalNode,
};

export default nodeTypes;


