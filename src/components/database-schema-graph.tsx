"use client";

import { useCallback } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  type Node,
  type Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  type OnConnect,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// Define table node data
interface TableNode {
  id: string;
  name: string;
  type: "core" | "junction" | "auth" | "metadata";
  fields: string[];
  description: string;
}

// Define our database schema
const tableNodes: TableNode[] = [
  // Core entities
  {
    id: "episode",
    name: "Episode",
    type: "core",
    fields: ["id", "episodeId", "title", "transcript", "duration", "wordCount"],
    description: "Individual podcast episodes with metadata and content",
  },
  {
    id: "podcast",
    name: "Podcast",
    type: "core",
    fields: ["id", "podcastId", "title", "description", "imageUrl"],
    description: "Podcast show information",
  },
  {
    id: "person",
    name: "Person",
    type: "core",
    fields: ["id", "name", "bio", "imageUrl", "twitterHandle"],
    description: "Hosts, guests, speakers, and producers",
  },
  {
    id: "company",
    name: "Company",
    type: "core",
    fields: ["id", "name", "industry", "websiteUrl", "logoUrl"],
    description: "Companies mentioned or sponsoring episodes",
  },
  {
    id: "book",
    name: "Book",
    type: "core",
    fields: ["id", "title", "author", "isbn", "publishedYear"],
    description: "Books recommended or mentioned in episodes",
  },
  {
    id: "topic",
    name: "Topic",
    type: "core",
    fields: ["id", "name", "description"],
    description: "Discussion topics and themes",
  },
  {
    id: "category",
    name: "Category",
    type: "core",
    fields: ["id", "categoryId", "categoryName", "categoryDisplayName"],
    description: "Podcast categories from Podscan API",
  },

  // Metadata tables
  {
    id: "episodeSegment",
    name: "Episode Segment",
    type: "metadata",
    fields: ["id", "episodeId", "text", "startTime", "endTime"],
    description: "Transcript segments with timing information",
  },
  {
    id: "episodeWordTimestamp",
    name: "Episode Word Timestamp",
    type: "metadata",
    fields: ["id", "episodeId", "segmentId", "word", "startTime", "endTime"],
    description: "Individual word timestamps for precise search",
  },
  {
    id: "quote",
    name: "Quote",
    type: "metadata",
    fields: ["id", "text", "speakerId", "episodeId", "timestamp"],
    description: "Key quotes with speaker attribution",
  },

  // Junction tables (many-to-many relationships)
  {
    id: "episodeCategory",
    name: "Episode ↔ Category",
    type: "junction",
    fields: ["id", "episodeId", "categoryId"],
    description: "Links episodes to categories",
  },
  {
    id: "episodePerson",
    name: "Episode ↔ Person",
    type: "junction",
    fields: ["id", "episodeId", "personId", "role"],
    description: "Links episodes to people with roles (host/guest/producer)",
  },
  {
    id: "episodeCompany",
    name: "Episode ↔ Company",
    type: "junction",
    fields: ["id", "episodeId", "companyId", "mentionType"],
    description: "Links episodes to companies with mention types",
  },
  {
    id: "episodeBook",
    name: "Episode ↔ Book",
    type: "junction",
    fields: ["id", "episodeId", "bookId", "mentionContext"],
    description: "Links episodes to books with context",
  },
  {
    id: "episodeTopic",
    name: "Episode ↔ Topic",
    type: "junction",
    fields: ["id", "episodeId", "topicId", "relevanceScore"],
    description: "Links episodes to topics with relevance scores",
  },
  {
    id: "podcastHost",
    name: "Podcast ↔ Host",
    type: "junction",
    fields: ["id", "podcastId", "personId", "isPrimary"],
    description: "Links podcasts to their hosts",
  },

  // Auth tables
  {
    id: "user",
    name: "User",
    type: "auth",
    fields: ["id", "name", "email", "emailVerified", "image"],
    description: "Application users (Better Auth)",
  },
  {
    id: "session",
    name: "Session",
    type: "auth",
    fields: ["id", "userId", "token", "expiresAt"],
    description: "User sessions (Better Auth)",
  },
];

// Define key relationships (simplified for clarity)
const relationships = [
  // Core relationships only
  { from: "episode", to: "podcast", label: "belongs to" },
  { from: "episodeSegment", to: "episode", label: "part of" },
  { from: "episodeWordTimestamp", to: "episodeSegment", label: "within" },
  { from: "quote", to: "episode", label: "from" },

  // Key junction relationships (episode as central hub)
  { from: "episodeCategory", to: "episode", label: "" },
  { from: "episodePerson", to: "episode", label: "" },
  { from: "episodeCompany", to: "episode", label: "" },
  { from: "episodeBook", to: "episode", label: "" },
  { from: "episodeTopic", to: "episode", label: "" },
  { from: "podcastHost", to: "podcast", label: "" },

  // Auth relationships
  { from: "session", to: "user", label: "belongs to" },
];

// Custom node component for tables
function TableNode({ data }: { data: TableNode }) {
  const getNodeStyle = (type: string) => {
    switch (type) {
      case "core":
        return "bg-blue-50 border-blue-200 shadow-blue-100";
      case "junction":
        return "bg-green-50 border-green-200 shadow-green-100";
      case "auth":
        return "bg-purple-50 border-purple-200 shadow-purple-100";
      case "metadata":
        return "bg-orange-50 border-orange-200 shadow-orange-100";
      default:
        return "bg-gray-50 border-gray-200 shadow-gray-100";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "core":
        return "text-blue-600 bg-blue-100";
      case "junction":
        return "text-green-600 bg-green-100";
      case "auth":
        return "text-purple-600 bg-purple-100";
      case "metadata":
        return "text-orange-600 bg-orange-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  return (
    <div
      className={`min-w-56 max-w-56 rounded-lg border p-3 shadow-md ${getNodeStyle(
        data.type,
      )}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-sm text-gray-900 truncate">
          {data.name}
        </h3>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${getTypeColor(
            data.type,
          )}`}
        >
          {data.type}
        </span>
      </div>

      <p className="mb-2 text-xs text-gray-600 leading-relaxed">
        {data.description}
      </p>

      <div className="space-y-0.5">
        <div className="text-xs font-medium text-gray-700">Key Fields:</div>
        {data.fields.slice(0, 3).map((field) => (
          <div key={field} className="text-xs text-gray-600">
            • {field}
          </div>
        ))}
        {data.fields.length > 3 && (
          <div className="text-xs text-gray-500">
            +{data.fields.length - 3} more...
          </div>
        )}
      </div>
    </div>
  );
}

// Create nodes with better spacing and episode as central hub
const createNodes = (): Node[] => {
  const nodes: Node[] = [];

  // Position nodes in groups by type with more spacing
  const coreNodes = tableNodes.filter((t) => t.type === "core");
  const junctionNodes = tableNodes.filter((t) => t.type === "junction");
  const authNodes = tableNodes.filter((t) => t.type === "auth");
  const metadataNodes = tableNodes.filter((t) => t.type === "metadata");

  // Episode as central hub
  const episodeNode = coreNodes.find((t) => t.id === "episode");
  const otherCoreNodes = coreNodes.filter((t) => t.id !== "episode");

  if (episodeNode) {
    nodes.push({
      id: episodeNode.id,
      type: "default",
      position: { x: 600, y: 300 },
      data: { label: <TableNode data={episodeNode} /> },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  }

  // Other core entities in a circle around episode
  otherCoreNodes.forEach((table, index) => {
    const angle = (index * 2 * Math.PI) / otherCoreNodes.length;
    const radius = 450;
    const x = 600 + radius * Math.cos(angle);
    const y = 300 + radius * Math.sin(angle);

    nodes.push({
      id: table.id,
      type: "default",
      position: { x, y },
      data: { label: <TableNode data={table} /> },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  // Junction tables - vertical layout on far right with more space
  junctionNodes.forEach((table, index) => {
    nodes.push({
      id: table.id,
      type: "default",
      position: { x: 1500, y: -300 + index * 200 },
      data: { label: <TableNode data={table} /> },
      sourcePosition: Position.Left,
      targetPosition: Position.Right,
    });
  });

  // Auth tables - top left corner with more space
  authNodes.forEach((table, index) => {
    nodes.push({
      id: table.id,
      type: "default",
      position: { x: 50, y: -400 - index * 200 },
      data: { label: <TableNode data={table} /> },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });
  });

  // Metadata tables - bottom spread out more
  metadataNodes.forEach((table, index) => {
    nodes.push({
      id: table.id,
      type: "default",
      position: { x: 100 + index * 450, y: 1000 },
      data: { label: <TableNode data={table} /> },
      sourcePosition: Position.Top,
      targetPosition: Position.Bottom,
    });
  });

  return nodes;
};

// Create edges from relationships with cleaner styling
const createEdges = (): Edge[] => {
  return relationships.map((rel, index) => ({
    id: `edge-${index}`,
    source: rel.from,
    target: rel.to,
    label: rel.label,
    type: "smoothstep",
    animated: false,
    style: {
      stroke: "#d1d5db",
      strokeWidth: 1.5,
      strokeDasharray: rel.label === "" ? "5,5" : undefined, // Dashed for junction tables
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#d1d5db",
      width: 15,
      height: 15,
    },
    labelStyle: {
      fontSize: 10,
      fill: "#9ca3af",
      fontWeight: 400,
    },
    labelBgStyle: {
      fill: "white",
      fillOpacity: 0.9,
      rx: 3,
    },
  }));
};

export default function DatabaseSchemaGraph() {
  const [nodes, , onNodesChange] = useNodesState(createNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(createEdges());

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  return (
    <div className="h-screen w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        className="bg-gray-50"
      >
        <Background color="#e5e7eb" gap={20} />
        <Controls className="bg-white shadow-lg" />

        {/* Legend */}
        <div className="absolute left-4 top-4 rounded-lg bg-white p-4 shadow-lg">
          <h3 className="mb-3 font-semibold text-gray-900">Table Types</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-blue-200"></div>
              <span className="text-sm text-gray-700">Core Entities</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-green-200"></div>
              <span className="text-sm text-gray-700">Junction Tables</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-orange-200"></div>
              <span className="text-sm text-gray-700">Metadata</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-purple-200"></div>
              <span className="text-sm text-gray-700">Authentication</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="absolute right-4 top-4 rounded-lg bg-white p-4 shadow-lg">
          <h3 className="mb-3 font-semibold text-gray-900">Schema Stats</h3>
          <div className="space-y-2 text-sm text-gray-700">
            <div>
              {tableNodes.filter((t) => t.type === "core").length} Core Tables
            </div>
            <div>
              {tableNodes.filter((t) => t.type === "junction").length} Junction
              Tables
            </div>
            <div>
              {tableNodes.filter((t) => t.type === "metadata").length} Metadata
              Tables
            </div>
            <div>
              {tableNodes.filter((t) => t.type === "auth").length} Auth Tables
            </div>
            <div className="border-t pt-2 font-semibold">
              {tableNodes.length} Total Tables
            </div>
          </div>
        </div>
      </ReactFlow>
    </div>
  );
}
