import { Router, type IRouter } from "express";
import healthRouter from "./health";
import billingRouter from "./billing";
import catalogRouter from "./catalog";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/billing", billingRouter);
router.use("/catalog", catalogRouter);

export default router;
