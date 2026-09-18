import { gql } from "@apollo/client";

export const ROOMS_QUERY = gql`
  query Rooms {
    rooms {
      id
      name
      isPrivate
      isMember
    }
  }
`;
