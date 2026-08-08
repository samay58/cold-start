import React from "react";
import { Composition } from "remotion";
import { z } from "zod";

import { FirstCompanyGuideVideo } from "./FirstCompanyGuideVideo";

const firstCompanyGuideSchema = z.object({});

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      component={FirstCompanyGuideVideo}
      defaultProps={{}}
      durationInFrames={336}
      fps={24}
      height={1080}
      id="ColdStartFirstCompany"
      schema={firstCompanyGuideSchema}
      width={1920}
    />
  );
};
