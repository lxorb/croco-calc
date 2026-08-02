import { MonkeyResponseType } from "@croco-calc/contracts/util/api";

export type CrocoDataAware<T> = {
  data: T | null;
};

export class CrocoResponse<T = null>
  implements MonkeyResponseType, CrocoDataAware<T>
{
  public message: string;
  public data: T;

  constructor(message: string, data: T) {
    this.message = message;
    this.data = data;
  }
}
