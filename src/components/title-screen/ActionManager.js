export class ActionManager {
  constructor() {
      this.actions = new Map();
  }
  getAction(actionName) {
      return this.actions.get(actionName);
  }
  setAction(actionName, action) {
      this.actions.set(actionName, action);
  }
  hasAction() {
      return false;
  }
  setControlAction(actionName, controlName, controlAction) {
      // const action = this.actions.get(actionName);
      // if (action) {
      //     action.setControlAction(controlName, controlAction);
      // }
      throw new Error('not implemented: set control action');
  }
}